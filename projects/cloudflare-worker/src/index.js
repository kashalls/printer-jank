const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export default {

	async fetch(request, env) {
		if (request.method === 'POST') {
			const body = await request.formData();
			const token = body.get('cf-turnstile-response');
			const ip = request.headers.get('CF-Connecting-IP');

			let formData = new FormData();
			formData.append('secret', TURNSTILE_SECRET);
			formData.append('response', token);
			formData.append('remoteip', ip);

			const result = await fetch(url, {
				body: formData,
				method: 'POST'
			});

			const outcome = await result.json();
			if (outcome.success) {
				const ExternalBody = {
					username: body.get('username'),
					message: body.get('message')
				}

				const response = await fetch(EXTERNAL_SERVER, {
					body: ExternalBody,
					method: 'POST',
					headers: {
						'content-type': 'application/json;charset=UTF-8',
					}
				})

				if (response.success) {
					return new Response(JSON.stringify({ success: true }), { status: 204 })
				} else {
					return new Response(JSON.stringify({ success: false, error: ['something-went-wrong-and-i-dont-know-what-to-do'] }), { status: 500 })
				}
			} else {
				return new Response(JSON.stringify(outcome, { status: 401 }));
			}
		}

		if (request.method === 'GET') {
			const available = await env.AVAILABLE.get('available')
			if (available === null) {
				await env.AVAILABLE.put('available', false)
			}
			return new Response(JSON.stringify({ success: true, available: available === null ? false : Boolean(available) }))
		}
	}
};
