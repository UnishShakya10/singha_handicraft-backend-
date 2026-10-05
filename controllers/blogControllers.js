import Blog from "../model/Blog.js"

export const getBlogs = async(req,res)=>{
    const allBlogs = await Blog.find().populate("author",'fullname email')
  res.json(allBlogs)
}

export const createBlog = async(req,res)=>{
  const createdBlog = await Blog.create(req.body)
  res.json(createdBlog)
}

export const getBlogById = async(req,res)=>{
    const allBlogs = await Blog.findById(req.params.id)
  res.json(allBlogs)
}

export const deleteBlog = async(req,res)=>{
    const allBlogs = await Blog.findByIdAndDelete(req.params.id)
  res.json({
    message :"Blog deleted successfully"
  })
}

export const updateBlog = async(req,res)=>{
    const allBlogs = await Blog.findByIdAndUpdate(req.params.id,req.body,{new:true})
    res.json(allBlogs)
}