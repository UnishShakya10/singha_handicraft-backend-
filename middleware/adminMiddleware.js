export const adminMiddleware = (req, res, next) => {
  if (String(req.user?.role).toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Administrator access required" });
  }
  next();
};