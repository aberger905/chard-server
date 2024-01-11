import Agenda from 'agenda';
import ArticleService from './services/articleService';
const axios = require('axios');
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

agenda.define('send revision email', async (job: any, done) => {
  const { email, slug } = job.attrs.data;
  await articleService.sendRevisionEmail(email, slug)
  done();
});

agenda.define('send published email', async (job: any, done) => {
  const { email, slug, title } = job.attrs.data;
  await articleService.sendPublishedEmail(email, slug, title);
  done();
});


agenda.define('update news', async () => {
  try {
    const response = await axios.get(`${process.env.SERVER_DOMAIN}/news`);
    console.log('Internal API call response:', response.data);
  } catch (error) {
    console.error('Error in internal API call:', error);
  }
});

agenda.define('initiate article process', async (job: any, done) => {
  const { submissionId, plan } = job.attrs.data;
  try {
    const response = await axios.get(`${process.env.SERVER_DOMAIN}/webhook/initiate`, {
      params: { submissionId, plan }
    });
    console.log('Internal API call response:', response.data);
  } catch (error) {
    console.error('Error in internal API call:', error);
  }
});



export default agenda
