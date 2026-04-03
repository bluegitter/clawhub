export const convex = {};

export const convexHttp = {
  query: async (..._args: any[]) => {
    throw new Error("Convex client is unavailable in the local deployment.");
  },
  action: async (..._args: any[]) => {
    throw new Error("Convex client is unavailable in the local deployment.");
  },
};
