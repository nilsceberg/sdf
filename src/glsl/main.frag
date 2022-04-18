const float STEP_SIZE = 0.001;
const float MAX_RANGE = 5.0;

// Attribution: https://github.com/glslify/glsl-smooth-min/blob/master/poly.glsl
float smin(float a, float b, float k) {
	float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
	return -smin(-a, -b, k);
}

vec3 blend3(vec3 a, vec3 b, float sdfa, float sdfb, float sdf, float k) {
	float da = abs(sdfa - sdf);
	float db = abs(sdfb - sdf);
	float t = da / (da + db);
	return mix(a, b, t);
}

const vec3 SUN = normalize(vec3(-1.0, -1.0, 1.0));
vec3 diffuse(vec3 normal, vec3 color) {
	return color * (dot(-SUN, normal) + 1.0) / 2.0;
}

vec3 raymarch(vec3 ray) {
	vec3 point = vec3(0.0);
	float totalDistance = 0.0;
	vec3 finalColor = vec3(0.0);
	float reflectionFactor = 1.0;
	int jumps = 4;
	
	while (totalDistance < MAX_RANGE) {
		#evaluate <sdf>

		if (sdf < STEP_SIZE) {
			#evaluate <normal>
			#evaluate <color>
			finalColor = diffuse(normal, color);
			break;
			
			//finalColor = mix(finalColor, color, length(color) * reflectionFactor);

			// reflect:
			//reflectionFactor = 1.0 - dot(-ray, normal);
			//if (jumps-- == 0) break;
			//vec3 reflectionPlaneNormal = normalize(cross(normal, cross(normal, ray)));
			//float projection = dot(ray, reflectionPlaneNormal);
			//ray = -(ray - 2.0 * projection * reflectionPlaneNormal);
			
			//while (totalDistance < MAX_RANGE) {
			//	#include <sdf>
			//	if (sdf >= STEP_SIZE) break;
			//	pos += ray * STEP_SIZE;
			//	totalDistance += STEP_SIZE;
			//}
		}
		
		// Optimization: Use SDF as step size.
		point += ray * sdf;
		totalDistance += sdf;
	}
	
	return finalColor;
}

vec4 render(vec2 screenSpace) {
	vec3 color = raymarch(normalize(vec3(screenSpace, 1.0)));
	return vec4(color, 1.0);
}