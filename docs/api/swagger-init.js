'use strict';

window.addEventListener('DOMContentLoaded', () => {
  window.ui = SwaggerUIBundle({
    url: '/openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: -1,
    displayRequestDuration: true,
    displayOperationId: true,
    filter: true,
    persistAuthorization: false,
    validatorUrl: null,
    supportedSubmitMethods: [],
    presets: [SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout'
  });
});
