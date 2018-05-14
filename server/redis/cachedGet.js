export const cachedApi = ({redisCache, expiry, sanitizeJSON}) => ({app}) => {
  const _resolveApiCall = ({handleSuccess, res}) => sanitizedData => {
    handleSuccess({sanitizedData, res});
  };

  const _apiSuccess = ({handleSuccess, cacheKey, res}) => data => {
    const sanitizedData = sanitizeJSON(data);

    // cache result
    redisCache.setex(cacheKey, expiry, sanitizedData);
    _resolveApiCall({handleSuccess, res})(sanitizedData);
  };

  const _apiFail = ({handleError, res}) => error => {
    handleError({res, error});
  };

  const _handleUncachedApi = ({query, req, res, originalUrl}) => ({handleSuccess, handleError}) => error => {
    const apiFail = _apiFail({handleError, res});
    if (error) {
      apiFail(error);
    } else {
      query(req, res)
        .then(_apiSuccess({handleSuccess, cacheKey: originalUrl, res}))
        .catch(apiFail);
    }
  };

  const _get = (route, query, handleSuccess, handleError) => {
    app.get(route, (req, res) => {
      const { originalUrl } = req;
      redisCache.get(originalUrl, (error, result) => {
        if (result) {
          _resolveApiCall({handleSuccess, res})(result);
        } else {
          _handleUncachedApi({query, req, res, originalUrl})({handleSuccess, handleError})(error);
        }
      });
    });
  };

  return {
    get: _get,
  };
};
