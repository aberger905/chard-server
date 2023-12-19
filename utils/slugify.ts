

const slugify = (title: string, articleId: number) => {
  let slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  slug += `-${articleId}`;
  return slug;
};

export default slugify