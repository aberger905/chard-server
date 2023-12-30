import axios from 'axios';
import db from '../db/rds.config';
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
    const categories = ['business', 'entertainment', 'technology', 'government', 'sports', 'world', 'video', 'finance', 'health'];
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
    const articlesString = JSON.stringify(articles);
    const queryString = 'UPDATE news SET articles = $1 WHERE news_id = $2'
    const values = [articlesString, 1]

    try {
      await db.query(queryString, values);

    } catch (e) {
      console.error('error updating news values', e);
    }
    // try {

    //   const doc = await News.findOneAndUpdate(
    //     { news_Id: "mainInstance" },
    //     { $set: { articles: articles, lastUpdated: new Date() } },
    //     { new: true, upsert: true }
    //   );
    // } catch (e) {
    //   console.error('error saviing articles to database', e)
    // }
  }

  async getSavedArticles () {
    const queryString = 'SELECT articles FROM news WHERE news_id = $1';
    const values = [1];

    try {
        const response = await db.query(queryString, values);

        if (response.rows.length === 0) {
            console.error('No articles found or articles data is null');
            return null;
        }

        const articles = response.rows[0].articles;
        return articles;
    } catch (e) {
        console.error('Error fetching saved news articles', e);
        return null;
    }
    // try {
    //   const newsDoc: any = await News.findOne({news_Id: "mainInstance"});
    //   return newsDoc.articles;
    // } catch (e) {
    //   console.error('error fetching articles from database in getSavedArticles service', e);
    // }
  }
}

export default NewsService;