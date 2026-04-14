import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Create transporter only if SMTP settings are present
let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 465,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports (like 587)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends a welcome/credentials email to a user.
 * @param {string} to - The recipient's email address
 * @param {string} tempPassword - The auto-generated temporary password
 * @param {boolean} isReset - If true, the email says the password was reset instead of a new account
 * @returns {Promise<boolean>} - True if sent successfully, false otherwise
 */
export const sendCredentialsEmail = async (to, tempPassword, isReset = false) => {
  if (!transporter) {
    console.warn('⚠️ sendCredentialsEmail: No SMTP configuration found in .env. Email was NOT sent.');
    return false;
  }

  try {
    const fromStr = process.env.SMTP_FROM || `"Sistema Diagnos" <${process.env.SMTP_USER}>`;

    // Email content
    const subject = isReset
      ? '🗝️ Diagnos: Tu contraseña ha sido reseteada'
      : '🌟 Diagnos: Credenciales de acceso a tu nueva cuenta';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">Sistema Diagnos</h2>
        </div>
        <div style="padding: 30px; background-color: #fafafa;">
          <p style="font-size: 16px; color: #334155;">Hola,</p>
          <p style="font-size: 16px; color: #334155;">
            ${isReset
        ? 'Un administrador ha reseteado la contraseña de tu cuenta.'
        : 'Se ha creado tu cuenta para acceder a la plataforma web de Diagnos.'}
          </p>
          
          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; margin: 25px 0; border: 1px solid #cbd5e1;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">Tus credenciales de acceso son:</p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Usuario:</strong> ${to}</p>
            <p style="margin: 5px 0; font-size: 15px;"><strong>Contraseña temporal:</strong> <span style="background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 16px; color: #0284c7; font-weight: bold;">${tempPassword}</span></p>
          </div>
          
          <p style="font-size: 14px; color: #475569;">
            <em>* Al iniciar sesión por primera vez con esta clave temporal, el sistema te pedirá que elijas una nueva contraseña de forma obligatoria por seguridad.</em>
          </p>
          
          <div style="margin-top: 30px; text-align: center;">
            <a href="http://evaluacion.diagnoslab.com.ar/login" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin: 5px 10px;">Acceso Interno</a>
            <a href="http://evaluacion.diagnoslab.com.ar:81/login" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin: 5px 10px;">Acceso Externo</a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">Este es un mensaje automático, por favor no respondas a este correo.</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromStr,
      to,
      subject,
      html,
    });

    console.log(`✅ Email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return false;
  }
};

/**
 * Sends an email responding to a user's app feedback (User Experience report).
 * @param {string} to - The recipient's email address
 * @param {string} userName - The recipient's name
 * @param {string} originalMessage - The original feedback message
 * @param {string} adminReply - The admin's response
 * @param {string} status - The new status of the ticket
 */
export const sendFeedbackReplyEmail = async (to, userName, originalMessage, adminReply, status) => {
  if (!transporter) {
    console.warn('⚠️ sendFeedbackReplyEmail: No SMTP configuration found. Email was NOT sent.');
    return false;
  }

  try {
    const fromStr = process.env.SMTP_FROM || `"Sistema Diagnos" <${process.env.SMTP_USER}>`;

    const subject = `Respuesta a tu reporte de Experiencia del Usuario (Estado: ${status})`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">Sistema Diagnos</h2>
        </div>
        <div style="padding: 30px; background-color: #fafafa;">
          <p style="font-size: 16px; color: #334155;">Hola ${userName},</p>
          <p style="font-size: 16px; color: #334155;">
            Gracias por habernos enviado tus comentarios a través de la sección "Experiencia del Usuario".
          </p>
          
          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; margin: 25px 0; border: 1px solid #cbd5e1;">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: #64748b;">Tu mensaje original:</p>
            <p style="margin: 0; font-size: 15px; font-style: italic; color: #475569;">"${originalMessage}"</p>
          </div>

          <div style="background-color: #e0f2fe; padding: 15px; border-radius: 6px; margin: 25px 0; border: 1px solid #bae6fd;">
            <p style="margin: 0 0 5px 0; font-size: 14px; color: #0284c7; font-weight: bold;">Nuestra respuesta (Estado: ${status}):</p>
            <p style="margin: 0; font-size: 15px; color: #0369a1;">${adminReply}</p>
          </div>
          
          <p style="font-size: 14px; color: #475569;">
            Agradecemos mucho tus aportes, nos ayudan a seguir mejorando la plataforma para todos.
          </p>
          
        </div>
        <div style="background-color: #f8fafc; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">Este es un mensaje automático del Sistema de Desempeño.</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: fromStr,
      to,
      subject,
      html,
    });

    console.log(`✅ Feedback reply email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send feedback reply email to ${to}:`, error);
    return false;
  }
};
