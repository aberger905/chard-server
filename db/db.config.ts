import mongoose from 'mongoose';


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string)
    console.log('Connected to MongoDB successfully')
  } catch (e) {
    console.error('Error connecting to MongoDB', e);
  }
}

export default connectDB;