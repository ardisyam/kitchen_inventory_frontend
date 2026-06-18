export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("access_token_admin");

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("access_token_admin");
    localStorage.removeItem("account_id");
    localStorage.removeItem("house_id_under_test");

    window.dispatchEvent(new Event("auth-expired"));

    throw new Error("Session expired");
  }

  return response;
}