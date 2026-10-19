window.initAuthCarousel = function () {
  const stage = document.querySelector(".orbit-stage");
  if (!stage) return;

  // Prevent duplicate timers after switching between login/register
  if (window.authCarouselTimer) {
    clearInterval(window.authCarouselTimer);
  }

  const cards = [...stage.querySelectorAll(".system-card")];
  const counter = document.querySelector("#system-counter");
  const description = document.querySelector("#system-description");

  if (!cards.length || !counter || !description) return;

  const descriptions = cards.map(
    (card) => card.querySelector("p")?.textContent.trim() || "",
  );

  let activeIndex = 0;

  function showCard(index) {
    activeIndex = index;

    cards.forEach((card, i) => {
      card.classList.remove("active", "pos-0", "pos-1", "pos-2", "pos-3");

      if (i === index) {
        card.classList.add("active");
      } else {
        const position = (i - index + cards.length) % cards.length;
        card.classList.add(`pos-${position}`);
      }
    });

    counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;

    description.textContent = descriptions[index];
  }

  showCard(0);

  window.authCarouselTimer = setInterval(() => {
    showCard((activeIndex + 1) % cards.length);
  }, 5000);
};
