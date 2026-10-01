// VoxelShaper <-> Erin Catto Box3D bridge
// Box3D source pinned by build workflow to 9f998c862d54c03a633ecea3831937385c78b532.
// SPDX-License-Identifier: MIT

#include <emscripten/emscripten.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "box3d/box3d.h"
#include "box3d/collision.h"
#include "box3d/math_functions.h"

// Simple physics maps one VoxelShaper voxel to one Box3D body.
// Desktop procedural models may reach ~12k voxels, so the old 1024-slot bridge
// was not sufficient. Keep deterministic fixed storage, but size it above the
// editor's current maximum practical simulation budget.
#define VS_MAX_BODIES 16384
#define VS_MAX_JOINTS 2048

typedef struct
{
    b3BodyId id;
    bool used;
} vsBodySlot;

typedef struct
{
    b3JointId id;
    bool used;
} vsJointSlot;

static b3WorldId g_world = {0};
static vsBodySlot g_bodies[VS_MAX_BODIES];
static vsJointSlot g_joints[VS_MAX_JOINTS];

static void vs_clear_handles(void)
{
    memset(g_bodies, 0, sizeof(g_bodies));
    memset(g_joints, 0, sizeof(g_joints));
}

static bool vs_world_valid(void)
{
    return b3World_IsValid(g_world);
}

static b3BodyId vs_body(int handle)
{
    if (handle <= 0 || handle >= VS_MAX_BODIES || !g_bodies[handle].used)
    {
        return b3_nullBodyId;
    }
    return g_bodies[handle].id;
}

static int vs_alloc_body(b3BodyId id)
{
    for (int i = 1; i < VS_MAX_BODIES; ++i)
    {
        if (!g_bodies[i].used)
        {
            g_bodies[i].used = true;
            g_bodies[i].id = id;
            return i;
        }
    }
    return 0;
}

static int vs_alloc_joint(b3JointId id)
{
    for (int i = 1; i < VS_MAX_JOINTS; ++i)
    {
        if (!g_joints[i].used)
        {
            g_joints[i].used = true;
            g_joints[i].id = id;
            return i;
        }
    }
    return 0;
}

static b3Quat vs_inverse_quat(b3Quat q)
{
    b3Quat r = {{-q.v.x, -q.v.y, -q.v.z}, q.s};
    return r;
}

static b3Quat vs_world_frame_for_axis(b3Vec3 wantedAxis, bool axisIsLocalZ)
{
    b3Vec3 a = b3Normalize(wantedAxis);
    if (b3LengthSquared(a) < 0.5f)
    {
        a = axisIsLocalZ ? b3Vec3_axisZ : b3Vec3_axisX;
    }

    b3Matrix3 m;
    if (axisIsLocalZ)
    {
        b3Vec3 z = a;
        b3Vec3 x = b3Perp(z);
        b3Vec3 y = b3Normalize(b3Cross(z, x));
        x = b3Normalize(b3Cross(y, z));
        m.cx = x;
        m.cy = y;
        m.cz = z;
    }
    else
    {
        b3Vec3 x = a;
        b3Vec3 y = b3Perp(x);
        b3Vec3 z = b3Normalize(b3Cross(x, y));
        y = b3Normalize(b3Cross(z, x));
        m.cx = x;
        m.cy = y;
        m.cz = z;
    }
    return b3MakeQuatFromMatrix(&m);
}

static b3Transform vs_local_joint_frame(b3BodyId bodyId, b3Pos worldPivot, b3Quat worldJointRotation)
{
    b3Transform f = b3Transform_identity;
    f.p = b3Body_GetLocalPoint(bodyId, worldPivot);
    b3Quat bodyQ = b3Body_GetRotation(bodyId);
    f.q = b3NormalizeQuat(b3MulQuat(vs_inverse_quat(bodyQ), worldJointRotation));
    return f;
}

EMSCRIPTEN_KEEPALIVE
int vsb3_reset(float gx, float gy, float gz)
{
    if (vs_world_valid())
    {
        b3DestroyWorld(g_world);
    }
    vs_clear_handles();

    b3WorldDef def = b3DefaultWorldDef();
    def.gravity = (b3Vec3){gx, gy, gz};
    def.enableSleep = true;
    def.enableContinuous = true;
    def.workerCount = 1;
    g_world = b3CreateWorld(&def);
    return vs_world_valid() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void vsb3_destroy(void)
{
    if (vs_world_valid())
    {
        b3DestroyWorld(g_world);
    }
    g_world = b3_nullWorldId;
    vs_clear_handles();
}

EMSCRIPTEN_KEEPALIVE
int vsb3_create_body(int bodyType, float px, float py, float pz,
                      float qx, float qy, float qz, float qw,
                      float gravityScale, float linearDamping, float angularDamping)
{
    if (!vs_world_valid()) return 0;

    b3BodyDef def = b3DefaultBodyDef();
    def.type = bodyType == 2 ? b3_dynamicBody : (bodyType == 1 ? b3_kinematicBody : b3_staticBody);
    def.position = (b3Pos){px, py, pz};
    def.rotation = b3NormalizeQuat((b3Quat){{qx, qy, qz}, qw});
    def.gravityScale = gravityScale;
    def.linearDamping = linearDamping;
    def.angularDamping = angularDamping;
    def.enableSleep = true;
    def.isAwake = true;

    b3BodyId id = b3CreateBody(g_world, &def);
    if (!b3Body_IsValid(id)) return 0;
    return vs_alloc_body(id);
}

EMSCRIPTEN_KEEPALIVE
int vsb3_add_box(int bodyHandle,
                  float ox, float oy, float oz,
                  float hx, float hy, float hz,
                  float density, float friction, float restitution,
                  int groupIndex)
{
    b3BodyId bodyId = vs_body(bodyHandle);
    if (!b3Body_IsValid(bodyId)) return 0;

    b3ShapeDef shapeDef = b3DefaultShapeDef();
    shapeDef.density = density > 0.0f ? density : 1.0f;
    shapeDef.baseMaterial.friction = friction;
    shapeDef.baseMaterial.restitution = restitution;
    shapeDef.filter.groupIndex = groupIndex;

    b3BoxHull box = b3MakeOffsetBoxHull(hx, hy, hz, (b3Vec3){ox, oy, oz});
    b3ShapeId shapeId = b3CreateHullShape(bodyId, &shapeDef, &box.base);
    return b3Shape_IsValid(shapeId) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int vsb3_create_revolute(int bodyAHandle, int bodyBHandle,
                          float px, float py, float pz,
                          float ax, float ay, float az,
                          int enableLimit, float lowerAngle, float upperAngle,
                          int enableMotor, float motorSpeed, float maxMotorTorque,
                          int collideConnected)
{
    b3BodyId bodyA = vs_body(bodyAHandle);
    b3BodyId bodyB = vs_body(bodyBHandle);
    if (!b3Body_IsValid(bodyA) || !b3Body_IsValid(bodyB)) return 0;

    b3Pos pivot = (b3Pos){px, py, pz};
    b3Quat worldQ = vs_world_frame_for_axis((b3Vec3){ax, ay, az}, true);

    b3RevoluteJointDef def = b3DefaultRevoluteJointDef();
    def.base.bodyIdA = bodyA;
    def.base.bodyIdB = bodyB;
    def.base.localFrameA = vs_local_joint_frame(bodyA, pivot, worldQ);
    def.base.localFrameB = vs_local_joint_frame(bodyB, pivot, worldQ);
    def.base.collideConnected = collideConnected != 0;
    def.enableLimit = enableLimit != 0;
    def.lowerAngle = lowerAngle;
    def.upperAngle = upperAngle;
    def.enableMotor = enableMotor != 0;
    def.motorSpeed = motorSpeed;
    def.maxMotorTorque = maxMotorTorque > 0.0f ? maxMotorTorque : 1.0f;

    b3JointId id = b3CreateRevoluteJoint(g_world, &def);
    return b3Joint_IsValid(id) ? vs_alloc_joint(id) : 0;
}

EMSCRIPTEN_KEEPALIVE
int vsb3_create_prismatic(int bodyAHandle, int bodyBHandle,
                           float px, float py, float pz,
                           float ax, float ay, float az,
                           int enableLimit, float lowerTranslation, float upperTranslation,
                           int enableMotor, float motorSpeed, float maxMotorForce,
                           int collideConnected)
{
    b3BodyId bodyA = vs_body(bodyAHandle);
    b3BodyId bodyB = vs_body(bodyBHandle);
    if (!b3Body_IsValid(bodyA) || !b3Body_IsValid(bodyB)) return 0;

    b3Pos pivot = (b3Pos){px, py, pz};
    b3Quat worldQ = vs_world_frame_for_axis((b3Vec3){ax, ay, az}, false);

    b3PrismaticJointDef def = b3DefaultPrismaticJointDef();
    def.base.bodyIdA = bodyA;
    def.base.bodyIdB = bodyB;
    def.base.localFrameA = vs_local_joint_frame(bodyA, pivot, worldQ);
    def.base.localFrameB = vs_local_joint_frame(bodyB, pivot, worldQ);
    def.base.collideConnected = collideConnected != 0;
    def.enableLimit = enableLimit != 0;
    def.lowerTranslation = lowerTranslation;
    def.upperTranslation = upperTranslation;
    def.enableMotor = enableMotor != 0;
    def.motorSpeed = motorSpeed;
    def.maxMotorForce = maxMotorForce > 0.0f ? maxMotorForce : 1.0f;

    b3JointId id = b3CreatePrismaticJoint(g_world, &def);
    return b3Joint_IsValid(id) ? vs_alloc_joint(id) : 0;
}

EMSCRIPTEN_KEEPALIVE
int vsb3_create_weld(int bodyAHandle, int bodyBHandle,
                      float px, float py, float pz,
                      int collideConnected)
{
    b3BodyId bodyA = vs_body(bodyAHandle);
    b3BodyId bodyB = vs_body(bodyBHandle);
    if (!b3Body_IsValid(bodyA) || !b3Body_IsValid(bodyB)) return 0;

    b3Pos pivot = (b3Pos){px, py, pz};
    b3Quat worldQ = b3Quat_identity;

    b3WeldJointDef def = b3DefaultWeldJointDef();
    def.base.bodyIdA = bodyA;
    def.base.bodyIdB = bodyB;
    def.base.localFrameA = vs_local_joint_frame(bodyA, pivot, worldQ);
    def.base.localFrameB = vs_local_joint_frame(bodyB, pivot, worldQ);
    def.base.collideConnected = collideConnected != 0;
    def.linearHertz = 0.0f;
    def.angularHertz = 0.0f;
    def.linearDampingRatio = 1.0f;
    def.angularDampingRatio = 1.0f;

    b3JointId id = b3CreateWeldJoint(g_world, &def);
    return b3Joint_IsValid(id) ? vs_alloc_joint(id) : 0;
}

EMSCRIPTEN_KEEPALIVE
void vsb3_step(float dt, int substeps)
{
    if (!vs_world_valid()) return;
    if (dt <= 0.0f) dt = 1.0f / 60.0f;
    if (substeps < 1) substeps = 1;
    if (substeps > 16) substeps = 16;
    b3World_Step(g_world, dt, substeps);
}

EMSCRIPTEN_KEEPALIVE
void vsb3_apply_force(int bodyHandle, float fx, float fy, float fz)
{
    b3BodyId id = vs_body(bodyHandle);
    if (!b3Body_IsValid(id)) return;
    b3Body_ApplyForceToCenter(id, (b3Vec3){fx, fy, fz}, true);
}

EMSCRIPTEN_KEEPALIVE
float vsb3_body_mass(int bodyHandle)
{
    b3BodyId id = vs_body(bodyHandle);
    return b3Body_IsValid(id) ? b3Body_GetMass(id) : 0.0f;
}

static b3WorldTransform vs_transform(int bodyHandle)
{
    b3BodyId id = vs_body(bodyHandle);
    if (!b3Body_IsValid(id)) return b3WorldTransform_identity;
    return b3Body_GetTransform(id);
}

EMSCRIPTEN_KEEPALIVE float vsb3_body_px(int h) { return (float)vs_transform(h).p.x; }
EMSCRIPTEN_KEEPALIVE float vsb3_body_py(int h) { return (float)vs_transform(h).p.y; }
EMSCRIPTEN_KEEPALIVE float vsb3_body_pz(int h) { return (float)vs_transform(h).p.z; }
EMSCRIPTEN_KEEPALIVE float vsb3_body_qx(int h) { return vs_transform(h).q.v.x; }
EMSCRIPTEN_KEEPALIVE float vsb3_body_qy(int h) { return vs_transform(h).q.v.y; }
EMSCRIPTEN_KEEPALIVE float vsb3_body_qz(int h) { return vs_transform(h).q.v.z; }
EMSCRIPTEN_KEEPALIVE float vsb3_body_qw(int h) { return vs_transform(h).q.s; }
