// Maps a meal (title + tags + cuisine) to a warm gradient + food motif.
// Stand-in for recipe photography: consistent, charming, never broken.
const RULES = [
  [/braai|boerewors|steak|chop|rib|sosatie/i, ['🔥', '#F4D7BF', '#E7A87C']],
  [/fish|hake|snoek|salmon|tuna|prawn|seafood/i, ['🐟', '#DCE9E4', '#A9CDC0']],
  [/chicken|hoender|peri/i, ['🍗', '#F7E6C4', '#ECC587']],
  [/pasta|spaghetti|lasagn|macaroni|bolognese/i, ['🍝', '#F7E0CB', '#E8AE85']],
  [/curry|bobotie|breyani|biryani|masala|korma/i, ['🍛', '#F6DEC0', '#E0A968']],
  [/pizza/i, ['🍕', '#F6DCC9', '#E59E72']],
  [/burger|wrap|vetkoek/i, ['🍔', '#F4E1C6', '#E2B383']],
  [/taco|mexican|enchilada|quesadilla|nacho/i, ['🌮', '#F6E0C2', '#E5AE70']],
  [/soup|sop|potjie|stew|bredie|casserole|one[- ]?pot/i, ['🍲', '#EFE2D0', '#CFAE8A']],
  [/salad|slaai|veg|vegetable|vegetarian|greens/i, ['🥗', '#E4ECDB', '#B5CBA0']],
  [/rice|stir[- ]?fry|noodle|asian|thai|chinese|teriyaki/i, ['🥡', '#EAE4D8', '#C9B89C']],
  [/egg|omelet|frittata|quiche|breakfast/i, ['🍳', '#F8ECCF', '#EFD195']],
  [/toast|sandwich|braaibroodjie|bread/i, ['🥪', '#F4E6CF', '#E2C091']],
  [/leftover|restant/i, ['♻️', '#E8EBDF', '#C2CCAB']],
  [/takeaway|take[- ]?out|order in|treat/i, ['🥡', '#F1E2DA', '#DBB3A0']],
  [/lamb|skaap/i, ['🍖', '#F2DCCB', '#DDA887']],
  [/pork|spek|bacon/i, ['🥓', '#F6DFD2', '#E5AC8E']],
];

export function foodArt(meal) {
  const haystack = [meal?.title, meal?.cuisine, JSON.stringify(meal?.tags || '')]
    .filter(Boolean).join(' ');
  for (const [re, [emoji, from, to]] of RULES) {
    if (re.test(haystack)) return { emoji, from, to };
  }
  return { emoji: '🍽️', from: '#F1E7D6', to: '#DBC4A4' };
}

export function dayShort(day) {
  return { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }[day] || day;
}

export function todayName() {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
}
