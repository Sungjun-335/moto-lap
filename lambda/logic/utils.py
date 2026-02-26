import numpy as np
import math

def savgol_filter(x, window_length, polyorder, deriv=0, delta=1.0, axis=-1, mode='interp', cval=0.0):
    """
    A simple specialized implementation of Savitzky-Golay filter for 1D arrays
    using numpy, to avoid scipy dependency in Cloudflare Workers.
    
    This function mimics the basic behavior of scipy.signal.savgol_filter.
    
    Parameters
    ----------
    x : array_like
        The data to be filtered. Must be 1D.
    window_length : int
        The length of the filter window (i.e., the number of coefficients).
    polyorder : int
        The order of the polynomial used to fit the samples.
    deriv : int, optional
        The order of the derivative to compute. This must be a
        non-negative integer. The default is 0, which means to filter
        the data.
    delta : float, optional
        The spacing of the samples to which the filter will be applied.
        This is only used if deriv > 0. Default is 1.0.
    axis : int, optional
        The axis of the array x along which the filter is to be applied.
        Default is -1.
    mode : str, optional
        Must be 'interp'. Handling of extension at boundaries.
    cval : scalar, optional
        Value to fill past the edges of the input if mode is 'constant'.
        Default is 0.0.
        
    Returns
    -------
    y : ndarray
        The filtered data.
    """
    
    x = np.asarray(x, dtype=float)
    if axis != -1 and axis != 0:
        raise ValueError("Only 1D arrays are fully validated for this fallback.")
        
    # Ensure window_length is odd
    if window_length % 2 == 0:
        window_length += 1
        
    half_window = (window_length - 1) // 2
    
    # Precompute coefficients
    # b = (X^T * X)^-1 * X^T * y
    # We want the coefficient for the center point (or deriv)
    
    # Construct the design matrix for polynomial fitting
    # Indices centered around 0: [-half_window, ..., 0, ..., half_window]
    k = np.arange(-half_window, half_window + 1)
    
    # Matrix of powers: A[i, j] = k[i] ** j
    A = np.vander(k, polyorder + 1)[:, ::-1] # Powers 0 to polyorder
    
    # Calculate pseudo-inverse
    # (A^T * A)^-1 * A^T
    m = np.linalg.pinv(A)
    
    # The filter coefficients are the row corresponding to the definition of the value
    # For smoothing (deriv=0), we want the intercept, which is the row for k^0 (index 0)
    # For 1st deriv, we want row for k^1 (index 1), scaled by 1!
    # For 2nd deriv, row for k^2 (index 2), scaled by 2!
    
    coeffs = m[deriv] * math.factorial(deriv)
    
    if deriv > 0:
        coeffs /= (delta ** deriv)
        
    # Convolve
    # Mode 'interp' handling is complex to replicate exactly.
    # For simplicity/robustness in a fallback, we'll use 'reflect' or 'edge' padding by default
    # or just simple convolution 'same'.
    # Scipy 'interp' fits a polynomial to extend.
    # Here we will use np.pad with 'edge' to keep it simple and safe.
    
    padded_x = np.pad(x, (half_window, half_window), mode='edge')
    y = np.convolve(padded_x, coeffs[::-1], mode='valid')
    
    return y
