import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { sendEmail } from "./emailService.js";
import { sendSMS } from "./smsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HR_EMAIL = process.env.HR_EMAIL;
const HR_PHONE = process.env.HR_PHONE;

const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL;
const BUSINESS_PHONE = process.env.BUSINESS_PHONE;

/* ================================
   Helpers
================================ */

async function loadTemplate(name) {
  const filePath = path.join(__dirname, "../templates", name);
  return fs.readFile(filePath, "utf8");
}

function render(template, data) {
  let html = template;

  for (const key in data) {
    html = html.replaceAll(`{{${key}}}`, data[key] || "");
  }

  return html;
}

function formatPhone(phone) {
  if (!phone) return null;

  let cleaned = phone.toString().replace(/\s+/g, "");

  if (cleaned.startsWith("+")) return cleaned;

  if (/^\d+$/.test(cleaned)) return "+91" + cleaned;

  return null;
}

/* ================================
   EXISTING
================================ */

export async function notifyJobApplication(app) {
  const adminTpl = await loadTemplate("jobAdmin.html");
  const userTpl = await loadTemplate("jobUser.html");

  const data = {
    name: app.fullName,
    email: app.email,
    phone: app.phone,
    position: app.position,
    experience: app.experience,
    resumeUrl: `${process.env.APP_URL}${app.resumePath}`,
    adminUrl: `${process.env.APP_URL}/admin/hr-dashboard`,
  };

  await sendEmail({
    to: HR_EMAIL,
    subject: `New Job Application: ${app.position}`,
    html: render(adminTpl, data),
  });

  await sendEmail({
    to: app.email,
    subject: "Application Received",
    html: render(userTpl, data),
  });

  sendSMS(
    formatPhone(app.phone),
    `Your job application has been received by Atorix IT.`
  );
}

/* ================================
   DEMO REQUEST
================================ */

export async function notifyDemoRequest(demo) {
  const adminTpl = await loadTemplate("demoAdmin.html");
  const userTpl = await loadTemplate("demoUser.html");

  const data = {
    name: demo.name,
    company: demo.company,
    email: demo.email,
    phone: demo.phone,
    message: demo.message,
    adminUrl: `${process.env.APP_URL}/admin`,
  };

  await sendEmail({
    to: BUSINESS_EMAIL,
    subject: "New Demo Request",
    html: render(adminTpl, data),
  });

  await sendEmail({
    to: demo.email,
    subject: "Demo Request Received",
    html: render(userTpl, data),
  });

  sendSMS(
    formatPhone(demo.phone),
    `Your demo request has been received by Atorix IT.`
  );
}

/* ================================
   CUSTOMER ACCEPTED
================================ */

export async function notifyCustomerAccepted(demo) {
  try {
    const userTpl = await loadTemplate("customerAcceptedUser.html");
    const adminTpl = await loadTemplate("customerAcceptedAdmin.html");

    const data = {
      name: demo.name,
      email: demo.email,
      phone: demo.phone,
      company: demo.company,
      role: demo.role,
      status: demo.status
    };

    await sendEmail({
      to: demo.email,
      subject: "Service Engagement Confirmation",
      html: render(userTpl, data),
    });

    await sendEmail({
      to: BUSINESS_EMAIL,
      subject: "Customer Accepted",
      html: render(adminTpl, data),
    });

    sendSMS(
      formatPhone(demo.phone),
      `Atorix IT: Your request has been approved. Our team will contact you shortly.`
    );

    const bizPhone = formatPhone(BUSINESS_PHONE);

    if (bizPhone) {
      sendSMS(
        bizPhone,
        `Customer accepted: ${demo.name}, ${demo.company}`
      );
    }

  } catch (err) {
    console.error("Customer acceptance notification failed:", err);
  }
}

/* ================================
   TERMINATION (NEW)
================================ */

export async function notifyCustomerTermination(customer) {
  try {

    const tpl = await loadTemplate("customerTerminated.html");

    const data = {
      name: customer.name,
      email: customer.email,
      company: customer.company
    };

    /* Customer Email */
    await sendEmail({
      to: customer.email,
      subject: "Service Engagement Update – Atorix IT",
      html: render(tpl, data),
    });

    /* Business Email */
    await sendEmail({
      to: BUSINESS_EMAIL,
      subject: "Customer Engagement Closed",
      html: render(tpl, data),
    });

    /* Customer SMS */
    sendSMS(
      formatPhone(customer.phone),
      "Atorix IT: Your service engagement has been concluded. For further assistance, contact our support team."
    );

  } catch (err) {
    console.error("Termination notification failed:", err);
  }
}

/* ================================
   BUSINESS LEAD
================================ */

export async function notifyBusinessLead(lead) {
  const adminTpl = await loadTemplate("leadAdmin.html");

  const data = {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    role: lead.role,
    adminUrl: `${process.env.APP_URL}/admin`,
  };

  sendEmail({
    to: BUSINESS_EMAIL,
    subject: "New Business Lead",
    html: render(adminTpl, data),
  });

  sendSMS(
    formatPhone(BUSINESS_PHONE),
    `New lead received: ${lead.name}`
  );
}

/* ================================
   LEAVE
================================ */

export async function notifyLeaveStatus(leave, employee) {
  const templateName =
    leave.status === "approved"
      ? "leaveApproved.html"
      : "leaveRejected.html";

  const template = await loadTemplate(templateName);

  const data = {
    name: employee.name,
    leaveType: leave.leaveType,
    days: leave.days,
  };

  await sendEmail({
    to: employee.email,
    subject:
      leave.status === "approved"
        ? "Leave Approved"
        : "Leave Status Update",
    html: render(template, data),
  });
}