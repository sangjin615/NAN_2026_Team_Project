export function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || !Array.isArray(catalog.items)) errors.push('catalog.items must be an array');
  if (catalog?.items?.length !== 60) errors.push(`expected 60 base items, received ${catalog?.items?.length ?? 0}`);
  for (const item of catalog?.items || []) {
    if (!item.base_id || !item.category || !item.item_name_ko) errors.push(`invalid item metadata: ${item?.base_id || 'unknown'}`);
    for (const grade of ['COMMON', 'RARE', 'EPIC', 'LEGENDARY']) {
      if (!item.grades?.[grade]) errors.push(`${item.base_id} is missing ${grade} sprite`);
    }
  }
  return errors;
}

export async function loadCatalog(url = './assets/items/catalog.json') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`catalog load failed: ${response.status}`);
  const catalog = await response.json();
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join('\n'));
  return catalog;
}

export function spriteUrl(item, grade, catalogBase = './assets/items/') {
  const relativePath = item.spritePath || item.grades?.[grade];
  if (!relativePath) throw new Error(`sprite path is missing for ${item.baseItemId || item.base_id || 'unknown item'}`);
  const pageBase = globalThis.document?.baseURI || globalThis.location?.href;
  return new URL(relativePath.split('\\').join('/'), new URL(catalogBase, pageBase)).href;
}
