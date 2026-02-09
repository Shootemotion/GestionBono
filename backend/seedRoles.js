import Role from './src/models/Role.model.js';

const roleCaps = {
    superadmin: ["*"],

    rrhh: [
        "estructura:ver", "estructura:crear", "estructura:editar", "estructura:eliminar",
        "nomina:ver", "nomina:crear", "nomina:editar", "nomina:eliminar", "nomina:evaluar",
        "objetivos:ver", "objetivos:crear", "objetivos:editar", "objetivos:eliminar",
        "aptitudes:ver", "aptitudes:crear", "aptitudes:editar", "aptitudes:eliminar",
        "asignaciones:ver", "asignaciones:editar", "rrhh:evaluaciones:ver",
        "rrhh:evaluaciones:cierre",
        "rrhh:evaluaciones:reabrir",
        "usuarios:manage"
    ],
    jefe_area: [
        "estructura:ver", "nomina:ver", "nomina:editar", "nomina:evaluar",
        "objetivos:ver", "objetivos:editar",
        "aptitudes:ver", "aptitudes:editar",
        "asignaciones:ver", "asignaciones:editar",
    ],
    jefe_sector: [
        "estructura:ver", "nomina:ver", "nomina:evaluar",
        "objetivos:ver", "nomina:editar",
        "aptitudes:ver",
        "asignaciones:ver", "asignaciones:editar",
    ],
    directivo: [
        "estructura:ver", "estructura:crear", "estructura:editar", "estructura:eliminar",
        "nomina:ver", "nomina:crear", "nomina:editar", "nomina:eliminar", "nomina:evaluar",
        "objetivos:ver", "objetivos:crear", "objetivos:editar", "objetivos:eliminar",
        "aptitudes:ver", "aptitudes:crear", "aptitudes:editar", "aptitudes:eliminar",
        "asignaciones:ver", "asignaciones:editar", "rrhh:evaluaciones:ver",
        "rrhh:evaluaciones:cierre",
        "rrhh:evaluaciones:reabrir",
        "usuarios:manage"
    ],
    visor: ["estructura:ver", "nomina:ver", "aptitudes:ver"],
};

const roleNames = {
    superadmin: "Super Admin",
    rrhh: "Recursos Humanos",
    jefe_area: "Jefe de Área",
    jefe_sector: "Jefe de Sector",
    directivo: "Directivo",
    visor: "Visor"
};

const roleDescriptions = {
    superadmin: "Acceso total al sistema",
    rrhh: "Gestión de personal y evaluaciones",
    jefe_area: "Gestión de su área y evaluaciones",
    jefe_sector: "Gestión de su sector y evaluaciones",
    directivo: "Visión global y gestión estratégica",
    visor: "Acceso de solo lectura básico"
};

export const seedRoles = async () => {
    try {
        const count = await Role.countDocuments();
        if (count > 0) {
            console.log("ℹ️ [Seed] Roles already exist. Skipping seed.");
            return;
        }

        console.log("🌱 [Seed] Seeding default roles...");

        const rolesToCreate = Object.entries(roleCaps).map(([slug, permissions]) => ({
            name: roleNames[slug] || slug,
            slug: slug,
            description: roleDescriptions[slug] || "",
            permissions: permissions,
            isSystem: true
        }));

        await Role.insertMany(rolesToCreate);
        console.log("✅ [Seed] Default roles created successfully.");

    } catch (error) {
        console.error("❌ [Seed] Error seeding roles:", error);
    }
};
