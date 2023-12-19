import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
  news_Id: {
    type: String,
    default: 'mainInstance',
    unique: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  articles: {}
});

const News = mongoose.model('News', newsSchema);

export default News;