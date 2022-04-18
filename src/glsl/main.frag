const float STEP_SIZE = 0.01;
const float MAX_RANGE = 5.0;

// Attribution: https://github.com/glslify/glsl-smooth-min/blob/master/poly.glsl
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 raymarch(vec3 ray) {
	vec3 point = vec3(0.0);
	float totalDistance = 0.0;
	vec3 finalColor = vec3(0.0);
	float reflectionFactor = 1.0;
	int jumps = 4;
	
	while (totalDistance < MAX_RANGE) {
		#include <sdf>

		if (sdf < STEP_SIZE) {
			//vec3 normal = normalize(modelGradient(pos));
			//vec3 color = diffuse(normal, modelColor(pos));
			//finalColor = mix(finalColor, color, length(color) * reflectionFactor);
			finalColor = vec3(1.0, 1.0, 1.0);
			break;
			
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