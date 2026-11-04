import { defaultBusiness } from "./model.js";

export const state = {
  loaded: false,
  storage: "idb",
  business: defaultBusiness(),
  customers: [],
  jobs: [],
  estimates: [],
  invoices: [],
  payments: [],
  priceBook: [],
  slabs: [],
  tasks: [],
  photos: [],
  photoJobId: ""
};

export function customerById(id) {
  return state.customers.find((customer) => customer.id === id) || null;
}

export function jobById(id) {
  return state.jobs.find((job) => job.id === id) || null;
}

export function jobsForCustomer(id) {
  return state.jobs.filter((job) => job.customerId === id);
}
