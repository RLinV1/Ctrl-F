// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResultItem } from "./result-item";

afterEach(cleanup);

describe("ResultItem", () => {
  it("disappears when its photo fails to load", () => {
    const { container, getByAltText } = render(
      <ul>
        <ResultItem id="a">
          <img alt="photo" src="/gone.jpg" />
        </ResultItem>
      </ul>,
    );
    fireEvent.error(getByAltText("photo"));
    expect(container.querySelector("[data-job=a]")).toBeNull();
  });
});
