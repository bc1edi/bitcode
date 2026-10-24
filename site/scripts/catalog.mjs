export function validateCatalog(reference, translation, locale) {
  const keys=Object.keys(reference);
  const missing=keys.filter(key=>!(key in translation));
  const extra=Object.keys(translation).filter(key=>!keys.includes(key));
  if(missing.length||extra.length)throw Error(`${locale}: missing ${missing.join(', ')}; extra ${extra.join(', ')}`);
  for(const [key,value] of Object.entries(translation))if(typeof value!=='string')throw Error(`${locale}.${key} must be a string`);
}
