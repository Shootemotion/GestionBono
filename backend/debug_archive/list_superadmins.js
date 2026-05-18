import mongoose from 'mongoose';
import Usuario from './src/models/Usuario.model.js';
import dotenv from 'dotenv';
dotenv.config();

async function listSuperAdmins() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test');
  const superadmins = await Usuario.find({ rol: 'superadmin' }).lean();
  console.log("Superadmins encontrados:");
  for (const admin of superadmins) {
      console.log(`- Email: ${admin.email}, ID: ${admin._id}, Nombre: ${admin.nombre || 'N/A'}, Activo: ${admin.activo}`);
  }
  process.exit(0);
}

listSuperAdmins().catch(console.error);
