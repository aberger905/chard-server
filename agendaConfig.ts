import Agenda from 'agenda';
import ArticleService from './services/articleService';
import * as dotenv from 'dotenv';
dotenv.config();
const articleService = new ArticleService();


const agenda = new Agenda({ db: { address: process.env.MONGO_URI as string}});

agenda.define('send editorial email', async (job: any, done) => {
  const { email, firstName, title } = job.attrs.data;
  await articleService.sendEditorialEmail(email, firstName, title);
  done();
});

agenda.define('send editorial email 2', async (job: any, done) => {
  const { email, firstName, title } = job.attrs.data;
  await articleService.sendEditorialEmail2(email, firstName, title);
  done();
});


agenda.define('send review email', async (job: any, done) => {
  const { email, firstName, title, slug } = job.attrs.data;
  await articleService.sendReviewEmail(email, firstName, title, slug);
  done();
});

agenda.define('send review email 2', async (job: any, done) => {
  const { email, firstName, title, slug } = job.attrs.data;
  await articleService.sendReviewEmail2(email, firstName, title, slug);
  done();
});

agenda.define('send review email 3', async (job: any, done) => {
  const { email, firstName, title, slug } = job.attrs.data;
  await articleService.sendReviewEmail3(email, firstName, title, slug);
  done();
});


export default agenda
