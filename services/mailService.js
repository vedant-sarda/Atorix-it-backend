import nodemailer from "nodemailer";

//////////////////////////////////////////////////////
// SMTP CONFIG
//////////////////////////////////////////////////////

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

//////////////////////////////////////////////////////
// SEND LEAVE STATUS MAIL
//////////////////////////////////////////////////////

export const sendLeaveApprovalMail = async (employee, leave) => {
  try {

    const fromDate = new Date(leave.from).toDateString();
    const toDate = new Date(leave.to).toDateString();

    const isApproved = leave.status === "Approved";

    const subject = isApproved
      ? `✅ ${leave.leaveType} Approved`
      : `❌ ${leave.leaveType} Rejected`;

    const statusColor = isApproved ? "#16a34a" : "#dc2626";

    //////////////////////////////////////////////////////
    // AUTO MESSAGE
    //////////////////////////////////////////////////////

    let autoMessage = "";

    if (isApproved) {

      switch (leave.leaveType) {
        case "Paid Leave":
          autoMessage = `
            <p>Your <b>Paid Leave</b> request has been approved.</p>
            <p>This leave will not affect your salary.</p>
          `;
          break;

        case "Medical Leave":
          autoMessage = `
            <p>Your <b>Medical Leave</b> request has been approved.</p>
            <p>Please take proper rest and recover soon.</p>
          `;
          break;

        default:
          autoMessage = `
            <p>Your leave request has been approved.</p>
          `;
      }

    } else {
      autoMessage = `
        <p>Your <b>${leave.leaveType}</b> request has been rejected.</p>
        <p>Please contact HR for further clarification.</p>
      `;
    }

    //////////////////////////////////////////////////////
    // FINAL MESSAGE DECISION
    //////////////////////////////////////////////////////

    const finalMessage =
      leave.messageType === "custom" &&
      leave.customMessage &&
      leave.customMessage.trim() !== ""
        ? `
          <div style="
            padding:15px;
            background:#fff7ed;
            border-left:4px solid #f97316;
            border-radius:6px;
          ">
            ${leave.customMessage}
          </div>
        `
        : autoMessage;

    //////////////////////////////////////////////////////
    // EMAIL TEMPLATE
    //////////////////////////////////////////////////////

    const htmlTemplate = `
      <div style="background:#f4f6f9;padding:40px 0;font-family:Arial,sans-serif;">
        
        <div style="max-width:600px;margin:auto;background:white;
                    border-radius:10px;overflow:hidden;
                    box-shadow:0 5px 20px rgba(0,0,0,0.1);">

          <div style="background:#1e293b;padding:20px;text-align:center;color:white;">
            <h2 style="margin:0;">Atorix IT</h2>
            <p style="margin:5px 0 0;font-size:14px;">
              Leave Management System
            </p>
          </div>

          <div style="padding:30px;">

            <h3>Hello ${employee.name},</h3>

            <div style="font-size:15px;line-height:1.6;margin-top:15px;">
              ${finalMessage}
            </div>

            <div style="margin:20px 0;padding:15px;
                        background:#f1f5f9;border-radius:8px;">
              
              <p><b>Leave Type:</b> ${leave.leaveType}</p>
              <p><b>Status:</b> 
                <span style="color:${statusColor};
                             font-weight:bold;">
                  ${leave.status}
                </span>
              </p>
              <p><b>From:</b> ${fromDate}</p>
              <p><b>To:</b> ${toDate}</p>
            </div>

            <p style="font-size:14px;color:#64748b;">
              If you have any questions, feel free to contact HR.
            </p>

            <br/>

            <p>
              Regards,<br/>
              <b>HR Team</b><br/>
              Atorix IT
            </p>

          </div>

        </div>
      </div>
    `;

    //////////////////////////////////////////////////////
    // SEND MAIL
    //////////////////////////////////////////////////////

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to: employee.email,
      subject,
      html: htmlTemplate,
    });

    console.log("✅ Leave mail sent successfully");

  } catch (error) {
    console.error("❌ SMTP Mail Error:", error.message);
  }
};
