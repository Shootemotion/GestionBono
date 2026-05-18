import mongoose from 'mongoose';
import Usuario from './src/models/Usuario.model.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

async function resetSuperadminPassword() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test');
  
  const email = 'superadmin@diagnos.com';
  const newPassword = 'adminpassword123';
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  const user = await Usuario.findOneAndUpdate(
    { email },
    { passwordHash: passwordHash, status: 'active', activo: true },
    { new: true }
  );

  if (user) {
    console.log(`Contraseña para ${email} actualizada exitosamente a: ${newPassword}`);
  } else {
    console.log(`Usuario no encontrado: ${email}`);
  }
  process.exit(0);
}

resetSuperadminPassword().catch(console.error);
