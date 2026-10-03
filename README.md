# Homegrown

A responsive React + TypeScript prototype for sharing surplus homegrown vegetables with nearby neighbors. All produce is free; optional tips are simulated and never charge money. The neighborhood, growers, pickup addresses, and reservations are fictional.

## Run locally

```sh
npm install
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`).

```sh
npm run test
npm run test:e2e
npm run build
npm run preview
```

## Try the demo

Explore nearby produce, choose a pickup window and portions, and reserve with or without an optional tip. Open My pickups to cancel or mark a collection complete. Switch to the grower role to post surplus, close listings, and manage the same reservations. Reset demo restores the sample neighborhood.

State is stored in versioned browser localStorage. Each browser has its own demo; there are no accounts, shared server data, real payments, delivery, live maps, or public deployment. Invalid saved state recovers to the sample data. Produce availability is rechecked when a reservation is confirmed; abandoned dialogs do not consume inventory.

The browser test suite uses an installed Google Chrome and checks reservations, optional tips, publishing, shared inventory, persistence, responsive layouts, and keyboard focus. All pickup addresses are fictional and stored in the browser; their visibility is a UI demonstration.

## Photography

The local JPEGs in `public/images` are illustrative preset photos, downloaded from Pexels. They represent produce types and do not depict the fictional growers or their gardens. Source pages identify the photographers and applicable Pexels terms; see the [Pexels license](https://www.pexels.com/license/).

| Asset | Photographer | Source |
| --- | --- | --- |
| `tomatoes.jpg` | Lubomir Vladikov | [Close-Up Shot of Tomatoes](https://www.pexels.com/photo/close-up-shot-of-tomatoes-11881466/) |
| `zucchini.jpg` | Ellie Burgin | [Green Vegetables](https://www.pexels.com/photo/green-vegetables-3375263/) |
| `greens.jpg` | Antoni Shkraba | [Close-Up Shot of Lettuce](https://www.pexels.com/photo/close-up-shot-of-lettuce-5589058/) |
| `carrots.jpg` | Daniel Dan | [Fresh Carrots](https://www.pexels.com/photo/fresh-carrots-7543101/) |
| `peppers.jpg` | Engin Akyurt | [Pile of Assorted Bell Peppers](https://www.pexels.com/photo/pile-of-assorted-bell-peppers-10112137/) |
| `herbs.jpg` | Alexas Fotos | [Green Leaf Plant in Close Up Photography](https://www.pexels.com/photo/green-leaf-plant-in-close-up-photography-7452769/) |
| `cucumbers.jpg` | Marta Dzedyshko | [Close-Up Photo of Cucumbers](https://www.pexels.com/photo/close-up-photo-of-cucumbers-2775838/) |
| `radishes.jpg` | Lola Russian | [Fresh Bunch of Red Radishes at Market Display](https://www.pexels.com/photo/fresh-bunch-of-red-radishes-at-market-display-32027595/) |
| `garden.jpg` | Kampus Production | [Person Holding a Basket at a Garden](https://www.pexels.com/photo/person-holding-a-basket-at-a-garden-7658822/) |
