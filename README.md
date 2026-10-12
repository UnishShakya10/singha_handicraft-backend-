# Singha Handicraft API

## Product image uploads

Product and avatar image files are stored in MongoDB GridFS and served by the public `/uploads/:id` endpoint. This works with the existing MongoDB database and does not require Cloudinary or Render local disk persistence.

Uploads accept JPEG, PNG, WebP, and GIF files up to 10 MB. The MongoDB deployment must allow GridFS writes and have enough database storage for the uploaded images.

Product documents store image paths such as `/uploads/<id>`. Existing legacy `/uploads/<filename>` files continue to be served from the local `uploads/` folder when present.

## Product inventory

Products use the existing non-negative integer `stock` field. Before deploying
the transactional order changes, run the one-time migration from the backend
directory:

```bash
node scripts/migrate-inventory.js
```

The migration initializes products whose stock is missing to `0`, marks
existing non-cancelled orders as having reserved their stock, and restores stock
for legacy cancelled orders exactly once. Review legacy cancellations if stock
was manually adjusted outside the application before running it.

Order creation, stock reservation, and cancellation restoration use MongoDB
transactions. The database must run as a replica set or sharded cluster;
standalone MongoDB servers do not support these transactions. Product
availability shown in the browser is informational; the order endpoint performs
the authoritative stock check and reservation.
