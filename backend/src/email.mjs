import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendEmail({ to, subject, text, html }) {
  const msg = {
    to,
    from: 'admin@moxident.com',
    subject,
    text,
    html
  };

  await sgMail.send(msg);
}