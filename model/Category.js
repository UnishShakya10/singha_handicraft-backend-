import mongoose from 'mongoose';
const { Schema } = mongoose;

const categorySchema = new Schema({


  name: String,
  icon: String,
  color: String,
  description: String,
  image: String,
  createdAt: Date
});

const Category = mongoose.model('Category', categorySchema);
export default Category