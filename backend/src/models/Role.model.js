import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    description: {
        type: String,
        default: ''
    },
    permissions: [{
        type: String,
        trim: true
    }],
    isSystem: {
        type: Boolean,
        default: false,
        description: "Si es true, no se puede eliminar (roles base)"
    }
}, { timestamps: true });

export default mongoose.model('Role', roleSchema);
