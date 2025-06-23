import { supabase } from './auth.js';

/**
 * Saves a webuddy configuration to the database.
 * @param {object} buddyData - The webuddy data to save.
 * @param {string} userId - The ID of the user saving the buddy.
 * @returns {Promise<object>}
 */
export async function saveWebuddy(buddyData) {
    const { data, error } = await supabase
        .from('webuddies')
        .insert([buddyData])
        .select();

    if (error) {
        console.error('Error saving Webuddy:', error.message);
        alert(`Error: ${error.message}`);
    }
    return { data, error };
}

/**
 * Fetches all webuddies for the currently logged-in user.
 * @returns {Promise<Array>}
 */
export async function getMyWebuddies() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.log("No user logged in.");
        return [];
    }

    const { data, error } = await supabase
        .from('webuddies')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching Webuddies:', error.message);
    }
    return data || [];
}

/**
 * Deletes a specific webuddy by its ID.
 * @param {string} buddyId - The ID of the webuddy to delete.
 * @returns {Promise<object>}
 */
export async function deleteWebuddy(buddyId) {
    const { error } = await supabase
        .from('webuddies')
        .delete()
        .eq('id', buddyId);

    if (error) {
        console.error('Error deleting Webuddy:', error.message);
        alert(`Error: ${error.message}`);
    }
    return { error };
}

/**
 * Fetches a single webuddy by its ID.
 * @param {string} buddyId - The ID of the webuddy to fetch.
 * @returns {Promise<object|null>}
 */
export async function getWebuddyById(buddyId) {
    const { data, error } = await supabase
        .from('webuddies')
        .select('*')
        .eq('id', buddyId)
        .single(); // Use .single() to get one record or null

    if (error) {
        console.error('Error fetching Webuddy by ID:', error.message);
    }
    return data;
}

/**
 * Updates an existing webuddy configuration in the database.
 * @param {string} buddyId - The ID of the webuddy to update.
 * @param {object} buddyData - The new webuddy data.
 * @returns {Promise<object>}
 */
export async function updateWebuddy(buddyId, buddyData) {
    const { data, error } = await supabase
        .from('webuddies')
        .update(buddyData)
        .eq('id', buddyId)
        .select();

    if (error) {
        console.error('Error updating Webuddy:', error.message);
        alert(`Error: ${error.message}`);
    }
    return { data, error };
}

/**
 * Uploads an image file to Supabase Storage.
 * @param {File} file - The image file to upload.
 * @param {string} userId - The user's ID.
 * @param {string} buddyId - The webuddy's ID.
 * @param {string} direction - The direction name for the image (e.g., 'up', 'up_left').
 * @returns {Promise<{publicURL: string, error: object}>}
 */
export async function uploadImageAndGetUrl(file, userId, buddyId, direction) {
    const fileExtension = file.name.split('.').pop();
    const filePath = `${userId}/${buddyId}/${Date.now()}.${fileExtension}`;

    // Upload the file to the 'webuddy-images' bucket
    const { error: uploadError } = await supabase.storage
        .from('webuddy-images')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true, // Overwrite file if it already exists
        });

    if (uploadError) {
        console.error(`Error uploading ${direction} image:`, uploadError);
        return { publicURL: null, error: uploadError };
    }

    // Get the public URL for the newly uploaded file
    const { data } = supabase.storage
        .from('webuddy-images')
        .getPublicUrl(filePath);

    if (!data || !data.publicUrl) {
        const urlError = new Error('Could not get public URL after upload.');
        console.error(urlError);
        return { publicURL: null, error: urlError };
    }

    // Add a timestamp to the URL to bypass browser caching on updates
    const publicURL = `${data.publicUrl}?t=${new Date().getTime()}`;

    return { publicURL, error: null };
} 