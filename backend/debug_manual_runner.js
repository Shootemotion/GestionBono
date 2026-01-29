
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dashByEmpleado } from './src/controllers/dashboard.controller.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gestion-bono";

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("Connected to DB");
        runDebug();
    })
    .catch(err => console.error("DB Connection Error", err));

async function runDebug() {
    const req = {
        params: {
            empleadoId: '695e7d97036e1fe0ecbc7074'
        },
        query: {
            anio: '2025'
        }
    };

    const res = {
        json: (data) => {
            // console.log("Response Data:", JSON.stringify(data, null, 2));
            console.log("Response received. Check logs above for [DEBUG] outputs.");
            process.exit(0);
        },
        status: (code) => {
            return {
                json: (data) => {
                    console.error(`Error ${code}:`, data);
                    process.exit(1);
                }
            }
        }
    };

    const next = (err) => {
        console.error("Next called with error:", err);
        process.exit(1);
    };

    console.log("Calling dashByEmpleado...");
    await dashByEmpleado(req, res, next);
}
