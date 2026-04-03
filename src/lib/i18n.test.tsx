/* @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider, useI18n } from "./i18n";

function LocaleProbe() {
  const { locale, setLocale, t, formatCompactNumber } = useI18n();

  return (
    <div>
      <div data-testid="locale">{locale}</div>
      <div data-testid="label">{t("nav.search")}</div>
      <div data-testid="number">{formatCompactNumber(12000)}</div>
      <button type="button" onClick={() => setLocale("zh")}>
        switch
      </button>
    </div>
  );
}

describe("i18n", () => {
  it("defaults to english without saved preference", () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");

    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("label").textContent).toBe("Search");
  });

  it("switches locale and persists to localStorage", () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");

    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByTestId("locale").textContent).toBe("zh");
    expect(screen.getByTestId("label").textContent).toBe("搜索");
    expect(screen.getByTestId("number").textContent).toMatch(/万|k/i);
    expect(window.localStorage.getItem("clawhub-locale")).toBe("zh");
  });
});
