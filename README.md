# Singha Handicraft API

## Product image uploads

Product and avatar image files are stored in MongoDB GridFS and served by the public `/uploads/:id` endpoint. This works with the existing MongoDB database and does not require Cloudinary or Render local disk persistence.

Uploads accept JPEG, PNG, WebP, and GIF files up to 10 MB. The MongoDB deployment must allow GridFS writes and have enough database storage for the uploaded images.

Product documents store image paths such as `/uploads/<id>`. Existing legacy `/uploads/<filename>` files continue to be served from the local `uploads/` folder when present.
