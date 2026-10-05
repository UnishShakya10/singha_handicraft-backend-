import mongoose from 'mongoose';
const { Schema } = mongoose;

const blogSchema = new Schema({
//   title: String, // String is shorthand for {type: String}

  title : {
    type : String,
    required : true
  },
  author: {
     type : mongoose.Schema.Types.ObjectId,
     ref :'User'
  },
  body: String,
  likes: Number,
  category : String,
  image : String 
});

const Blog = mongoose.model('Blog', blogSchema);
export default Blog