export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("access_token_admin");

  console.log(
    `[API] ${options.method || "GET"} ${url}`
  );
  
 // if (import.meta.env.DEV) {
 // console.log(
 //   `[API] ${options.method || "GET"} ${url}`
 // );
//}

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

    window.dispatchEvent(new Event("auth-expired"));

    return response;
  }

  return response;
}