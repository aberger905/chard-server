import NewsService from '../services/newsService'
import { Request, Response, NextFunction } from 'express'

class NewsController {

  private newsService: NewsService

  constructor () {
    const apiKey = process.env.BING_API_KEY;

    if (!apiKey) {
      throw new Error("BING_API_KEY env variable is not set")
    }

    this.newsService = new NewsService(apiKey)
    this.getArticles = this.getArticles.bind(this);
    this.saveArticles = this.saveArticles.bind(this);
    this.getSavedArticles = this.getSavedArticles.bind(this);
  }

  async getArticles (req: Request, res: Response, next: NextFunction) {
    console.log('in getArticles controller');
    try {
      const results = await this.newsService.getArticles();
      res.locals.articles = results;
      return next();
    } catch (e) {
      console.error('error in getArticles controller', e);
    }
  }

  async saveArticles (req: Request, res: Response, next: NextFunction) {
    const { articles } = res.locals;
    try {
      const response = await this.newsService.saveArticles(articles);
      next();
    } catch (e) {
      console.error('error in saveArticles controller', e);
    }
  }

  async getSavedArticles (req: Request, res: Response, next: NextFunction) {
    try {
      const response = await this.newsService.getSavedArticles();
      res.locals.articles = response;
      next();
    } catch (e) {

    }
  }
}

export default NewsController;