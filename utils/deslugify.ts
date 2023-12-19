
const deslugify = (slug: string) => {
  const lastHyphenIndex = slug.lastIndexOf('-');
  if (lastHyphenIndex === -1) {
      // Handle the case where no hyphen is present
      return null;
  }

  const idPart = slug.substring(lastHyphenIndex + 1);
  const id = parseInt(idPart, 10);

  return isNaN(id) ? null : id;
  }

  export default deslugify;