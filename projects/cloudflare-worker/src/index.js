const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
	'Access-Control-Max-Age': '86400',
}

export default {
	async fetch(request, env) {
		if (request.method === 'OPTIONS') {
			if (
				request.headers.get('Origin') !== null &&
				request.headers.get('Access-Control-Request-Method') !== null &&
				request.headers.get('Access-Control-Request-Headers') !== null
			  ) {
				// Handle CORS preflight requests.
				return new Response(null, {
				  headers: {
					...corsHeaders,
					'Access-Control-Allow-Headers': request.headers.get(
					  'Access-Control-Request-Headers'
					),
				  },
				});
			  } else {
				// Handle standard OPTIONS request.
				return new Response(null, {
				  headers: {
					Allow: 'GET, HEAD, POST, OPTIONS',
				  },
				});
			  }
		}
		if (request.method === 'POST') {
			const body = await request.json();
			const ip = request.headers.get('CF-Connecting-IP');

			console.log(body)

			let formData = new FormData();
			formData.append('secret', env.TURNSTILE_SECRET);
			formData.append('response', body.token);
			formData.append('remoteip', ip);

			const result = await fetch(url, {
				body: formData,
				method: 'POST'
			});

			const outcome = await result.json();
			if (outcome.success) {
				const ExternalBody = {
					message: body.message,
					ip
				}

				const apiResponse = await fetch(env.EXTERNAL_SERVER, {
					body: ExternalBody,
					method: 'POST',
					headers: {
						'content-type': 'application/json;charset=UTF-8',
					}
				})

				if (apiResponse.success) {
					const response = new Response(null, { status: 204})
					response.headers.set('Access-Control-Allow-Origin', url.origin)
					return response
				} else {
					console.log(JSON.stringify(apiResponse))
					const response = new Response(JSON.stringify({ success: false, error: ['something-went-wrong-and-i-dont-know-what-to-do'] }), { status: 500 })
					response.headers.set('Access-Control-Allow-Origin', url.origin)
					return response
				}
			} else {
				console.log(JSON.stringify(outcome))
				const response = new Response(JSON.stringify(outcome), { status: 401 })
				response.headers.set('Access-Control-Allow-Origin', url.origin)
				return response
			}
		}

		if (request.method === 'GET') {
			const available = await env.AVAILABLE.get('available')
			if (available === null) {
				await env.AVAILABLE.put('available', false)
			}
			return new Response(JSON.stringify({ success: true, available: available === null ? false : Boolean(available) }))
		}

		return new Response(null, {
			status: 405,
			statusText: 'Method Not Allowed'
		})
	}
};
