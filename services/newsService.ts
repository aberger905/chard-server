import axios from 'axios';
import * as dotenv from 'dotenv';
import News from '../db/models/newsModel';
dotenv.config();

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class NewsService {
  private apiKey: string;
  private baseUrl: string;
  private topUrl: string;
  private trendingUrl: string;

  constructor (apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.bing.microsoft.com/v7.0/news?mkt=en-us&category=';
    this.topUrl = 'https://api.bing.microsoft.com/v7.0/news?mkt=en-us&count=20';
    this.trendingUrl = 'https://api.bing.microsoft.com/v7.0/news/trendingtopics';
  }

  async getArticles () {
    const articles: { [key: string]: any[] } = {};
    const categories = ['business', 'entertainment', 'technology', 'government', 'sports', 'world', 'video', 'finance'];
    for (const category of categories) {
        articles[category] = await this.fetchArticlesByCategory(category);
        await delay(500);
    }

    articles['top'] = await this.fetchTopArticles();
    articles['trending'] = await this.fetchTrendingArticles();

    return articles;
  }

  private async fetchArticlesByCategory(category: string) {
    console.log('inside fetchArticlesByCategory function');
    try {
      const response = await axios.get(`https://api.bing.microsoft.com/v7.0/news/search?q=${category}&count=12&originalImg=true`, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey }
      })
      return response.data.value;
    } catch (e) {
      console.error(`error fetching articles for category ${category}`, e);
    }
  }

  private async fetchTopArticles() {
    try {
      const response = axios.get(this.topUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey }
      })
      return (await response).data.value;
    } catch (e) {
      console.error('error fetching top articles', e)
    }
  }

  private async fetchTrendingArticles() {

    try {
      const response = axios.get(this.trendingUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': this.apiKey }
      })
      return (await response).data.value;
    } catch (e) {
      console.error('error fetching top articles', e)
    }
  }

  async saveArticles (articles: any) {
    try {

      const doc = await News.findOneAndUpdate(
        { news_Id: "mainInstance" },
        { $set: { articles: articles, lastUpdated: new Date() } },
        { new: true, upsert: true }
      );
    } catch (e) {
      console.error('error saviing articles to database', e)
    }
  }

  async getSavedArticles () {
    try {
      const newsDoc: any = await News.findOne({news_Id: "mainInstance"});
      return newsDoc.articles;
    } catch (e) {
      console.error('error fetching articles from database in getSavedArticles service', e);
    }
  }
}

export default NewsService;