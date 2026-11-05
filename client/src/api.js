// All API calls use relative /api/... paths (same origin) only.
async function req(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'api_error');
    err.code = data.error || 'api_error';
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  catalog: () => req('/api/catalog'),
  search: (params) => {
    const q = new URLSearchParams(params).toString();
    return req('/api/search?' + q);
  },
  stayAvailability: (productSlug, from, to) =>
    req(`/api/stay/availability?productSlug=${encodeURIComponent(productSlug)}&from=${from || ''}&to=${to || ''}`),
  taxiEstimate: (params) => req('/api/taxi/estimate?' + new URLSearchParams(params).toString()),
  createBooking: (body) => req('/api/bookings', { method: 'POST', body: JSON.stringify(body) }),
  payBooking: (code, cardNumber) =>
    req(`/api/bookings/${encodeURIComponent(code)}/pay`, { method: 'POST', body: JSON.stringify({ cardNumber }) }),
  cancelBooking: (code) => req(`/api/bookings/${encodeURIComponent(code)}/cancel`, { method: 'POST' }),
  myBookings: (email) => req(`/api/bookings?email=${encodeURIComponent(email)}`),
  booking: (code) => req(`/api/bookings/${encodeURIComponent(code)}`),
  submitReview: (body) => req('/api/reviews', { method: 'POST', body: JSON.stringify(body) }),
  points: (email) => req(`/api/points?email=${encodeURIComponent(email)}`),
  mateMessages: (code) => req(`/api/mate/${encodeURIComponent(code)}`),
  mateSend: (body) => req('/api/mate/messages', { method: 'POST', body: JSON.stringify(body) }),
  partnerApply: (body) => req('/api/partners', { method: 'POST', body: JSON.stringify(body) }),
  adminOverview: () => req('/api/admin/overview'),
  adminBookings: () => req('/api/admin/bookings'),
  adminPayments: () => req('/api/admin/payments'),
  adminPartners: () => req('/api/admin/partners'),
  adminPartnerStatus: (id, status) =>
    req(`/api/admin/partners/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  adminBookingAction: (code, action) =>
    req(`/api/admin/bookings/${encodeURIComponent(code)}/${action}`, { method: 'POST' }),
  adminInventory: (body) => req('/api/admin/inventory', { method: 'POST', body: JSON.stringify(body) }),
  itinerary: (body) => req('/api/itinerary', { method: 'POST', body: JSON.stringify(body) }),
  chatbot: (message) => req('/api/chatbot', { method: 'POST', body: JSON.stringify({ message }) }),
  recommendations: (viewed, email) =>
    req(`/api/recommendations?viewed=${encodeURIComponent(viewed)}&email=${encodeURIComponent(email || '')}`),
  translateProduct: (slug, target) =>
    req(`/api/translate/product/${encodeURIComponent(slug)}?target=${encodeURIComponent(target)}`)
};
