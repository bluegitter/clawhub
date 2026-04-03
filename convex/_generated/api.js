/* eslint-disable */

const anyApi = new Proxy(
  {},
  {
    get() {
      return anyApi;
    },
  },
);

export const api = anyApi;
export const internal = anyApi;
export const components = {};
