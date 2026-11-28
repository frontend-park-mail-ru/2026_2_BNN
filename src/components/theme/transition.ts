let themeTransitionRunning = false;

export async function transitionTheme(
  button: Element,
  theme: "light" | "dark",
  apply: () => void
): Promise<void> {
  if (themeTransitionRunning) {
    return;
  }

  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply();
    return;
  }

  themeTransitionRunning = true;
  const root = document.documentElement;
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  let animation: Animation | undefined;

  root.dataset.themeTransition = "circle";

  try {
    const transition = document.startViewTransition(apply);

    try {
      await transition.ready;

      const circle = [`circle(${radius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`];

      animation = root.animate(
        {
          clipPath: theme === "light" ? circle.reverse() : circle,
        },
        {
          duration: 900,
          easing: "ease-in-out",
          fill: "forwards",
          pseudoElement:
            theme === "light"
              ? "::view-transition-new(theme-page)"
              : "::view-transition-old(theme-page)",
        }
      );

      await animation.finished;
    } catch {
      transition.skipTransition();
    }

    await transition.finished;
  } finally {
    animation?.cancel();
    delete root.dataset.themeTransition;
    themeTransitionRunning = false;
  }
}
