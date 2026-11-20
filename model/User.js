import mongoose from 'mongoose';
const { Schema } = mongoose;

const userSchema = new Schema({
    fullName: String,
    email: {
        type: String,
        unique: true,
    },
    password: String,
    avatar: String,
    shippingAddress: {
        fullName: { type: String, default: "" },
        phone: { type: String, default: "" },
        address: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        postalCode: { type: String, default: "" },
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
    },
});

const User = mongoose.model('User', userSchema);
export default User