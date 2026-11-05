const recipes = [
  { name: 'Pancakes', minutes: 20 },
  { name: 'Tomato soup', minutes: 35 },
  { name: 'Fried rice', minutes: 15 },
]
const list = document.getElementById('list')
for (const recipe of recipes) {
  const item = document.createElement('li')
  item.textContent = `${recipe.name} (${recipe.minutes} min)`
  list.append(item)
}
