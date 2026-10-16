'use strict';
// Photo conversion off the UI thread. The page transfers the pixel buffer in and the result out.
importScripts('photo-relief.js');
self.onmessage = (event) => {
  const data = event.data || {};
  try {
    const result = PhotoRelief.process(data.rgba, data.width, data.height, data.options || {});
    self.postMessage({ id: data.id, rgba: result.rgba, width: result.width, height: result.height, warning: result.warning, stats: result.stats }, [result.rgba.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, error: (error && error.message) || 'Photo conversion failed' });
  }
};
