import twilio from "twilio";

let client;

if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
  client = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_TOKEN
  );
} else {
  console.warn("⚠️ Twilio not configured properly.");
}

export async function sendSMS(to, message) {
  try {
    if (!client) {
      console.warn("⚠️ Twilio client not initialized.");
      return;
    }

    if (!to) {
      console.warn("⚠️ SMS skipped: No phone number provided.");
      return;
    }

    if (!to.startsWith("+")) {
      console.warn("⚠️ SMS skipped: Phone missing country code:", to);
      return;
    }

    const res = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: to,
    });

    console.log("📱 SMS sent:", res.sid);

  } catch (error) {
    // ❌ DO NOT THROW
    console.error("❌ SMS Failed:", error.message);
  }
}
