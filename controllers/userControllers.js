import User from "../model/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const publicUser = (user) => ({
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
});

const getJwtSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET must be configured on the server");
    }
    return process.env.JWT_SECRET;
};

export const getUsers = async (req, res) => {
    const users = await User.find().select("-password");
    res.json(users);
};

export const createUser = async (req, res) => {
    const { email, password, avatarUrl } = req.body;
    if (!email || !password || !req.body.fullName) {
        return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
        return res.status(409).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    if (req.file && !req.file.imageUrl) {
        throw new Error("The upload middleware did not provide an image URL.");
    }
    const avatar = req.file ? req.file.imageUrl : avatarUrl || "";
    const createdUser = await User.create({
        fullName: req.body.fullName,
        email,
        password: hashedPassword,
        avatar,
        role: "user",
    });

    res.status(201).json({
        message: "Account created successfully",
        user: publicUser(createdUser),
    });
};

export const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password || "", user.password))) {
        return res.status(401).json({ message: "Email or password incorrect" });
    }

    const token = jwt.sign(
        {
            id: String(user._id),
            email: user.email,
            role: String(user.role || "user").toLowerCase(),
        },
        getJwtSecret(),
        { expiresIn: "1h" }
    );

    res.json({
        message: "Logged in successfully",
        token,
        user: publicUser(user),
    });
};

export const getMe = async (req, res) => {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
};

export const getUserById = async (req, res) => {
    const isAdmin = String(req.user.role).toLowerCase() === "admin";
    if (!isAdmin && String(req.user.id) !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
    }
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
};

export const deleteUser = async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
};

export const updateUser = async (req, res) => {
    const isAdmin = String(req.user.role).toLowerCase() === "admin";
    if (!isAdmin && String(req.user.id) !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
    }
    const updates = {};
    if (typeof req.body.fullName === "string") updates.fullName = req.body.fullName;
    if (typeof req.body.avatar === "string") updates.avatar = req.body.avatar;

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
    }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
};