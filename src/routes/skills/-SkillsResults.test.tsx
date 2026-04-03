/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SkillsResults } from "./-SkillsResults";

vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children: ReactNode }) => <a href="/">{props.children}</a>,
}));

vi.mock("../../lib/localBackend", () => ({
  shouldUseLocalBackend: () => false,
}));

vi.mock("../../lib/useLocalStars", () => ({
  useLocalStars: () => ({
    isAuthenticated: false,
    starredSet: new Set<string>(),
    toggle: vi.fn(),
  }),
}));

describe("SkillsResults", () => {
  it("shows author real name without username in list view", () => {
    render(
      <SkillsResults
        isLoadingSkills={false}
        sorted={[
          {
            skill: {
              _id: "skill_1",
              _creationTime: 0,
              slug: "weather",
              displayName: "Weather",
              summary: "Forecasts",
              ownerUserId: "users:1",
              ownerPublisherId: undefined,
              canonicalSkillId: undefined,
              forkOf: undefined,
              latestVersionId: undefined,
              tags: {},
              badges: undefined,
              stats: {
                downloads: 42,
                installsCurrent: 0,
                installsAllTime: 0,
                stars: 3,
                versions: 1,
                comments: 0,
              },
              createdAt: 0,
              updatedAt: 0,
            },
            latestVersion: null,
            ownerHandle: "steipete",
            owner: {
              _id: "publisher_1",
              _creationTime: 0,
              kind: "user",
              handle: "steipete",
              displayName: "Peter Steinberger",
              image: null,
              bio: undefined,
              linkedUserId: undefined,
            },
          },
        ]}
        view="list"
        listDoneLoading={true}
        hasQuery={false}
        canLoadMore={false}
        isLoadingMore={false}
        canAutoLoad={false}
        loadMoreRef={{ current: null }}
        loadMore={() => {}}
      />,
    );

    expect(screen.getByText("Peter Steinberger")).toBeTruthy();
    expect(screen.queryByText("@steipete")).toBeNull();
  });
});
