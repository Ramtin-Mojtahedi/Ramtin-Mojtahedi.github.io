# News image sources

These assets are used inside the compact news panel.

- `spectral-adapters-pipeline.png`: complete original figure 1 from the portfolio author's preprint, https://arxiv.org/html/2609.11703v1/figure1.png. Credit: Mojtahedi et al. The source record is https://arxiv.org/abs/2609.11703. No general Creative Commons licence is asserted.
- `author-profile.jpg`: decoded profile image obtained from the repository owner's GitHub avatar at https://avatars.githubusercontent.com/u/85639926?v=4. It is displayed with an explicit GitHub profile-image credit, not represented as an image retrieved from a LinkedIn post.

News records keep source links and asset SHA-256 hashes in `_data/news.json`. Use real source images when verifiable; otherwise use the labelled profile image. Do not use the legacy embedded portrait SVG as a fallback: visual inspection found its embedded raster data invalid even though the SVG element itself reported as loaded.

The browser checks exercise image loading and containment at 320–1600 px, chronological order, reader controls, reduced motion, feed refresh and broken-image handling. Screenshots must also be visually inspected; an image element's `naturalWidth` alone does not validate nested SVG content.
