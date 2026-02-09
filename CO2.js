export const averageIntensity = {
    WORLD: 472.94,
    DE: 342.06,
    CH: 36.72,
    AT: 102.62,
    FR: 44.18,
    US: 383.55,
    CN: 557.5
};

const GIGABYTE = 1e3 * 1e3 * 1e3;
const SWDV4 = {
    OPERATIONAL_KWH_PER_GB_DATACENTER: 0.055,
    OPERATIONAL_KWH_PER_GB_NETWORK: 0.059,
    OPERATIONAL_KWH_PER_GB_DEVICE: 0.08,
    EMBODIED_KWH_PER_GB_DATACENTER: 0.012,
    EMBODIED_KWH_PER_GB_NETWORK: 0.013,
    EMBODIED_KWH_PER_GB_DEVICE: 0.081,
};



function operationalEnergyPerSegment(bytes) {
    const transferedBytesToGb = bytes / GIGABYTE;
    const dataCenter = transferedBytesToGb * SWDV4.OPERATIONAL_KWH_PER_GB_DATACENTER;
    const network = transferedBytesToGb * SWDV4.OPERATIONAL_KWH_PER_GB_NETWORK;
    const device = transferedBytesToGb * SWDV4.OPERATIONAL_KWH_PER_GB_DEVICE;
    return {
        dataCenter,
        network,
        device
    };
};

function operationalEmissions(bytes, intensitySelect) {
    const { dataCenter, network, device } = operationalEnergyPerSegment(bytes);
    let dataCenterGridIntensity = intensitySelect || averageIntensity.WORLD;
    let networkGridIntensity = averageIntensity.WORLD;
    let deviceGridIntensity = averageIntensity.WORLD;

    const dataCenterEmissions = dataCenter * dataCenterGridIntensity;
    const networkEmissions = network * networkGridIntensity;
    const deviceEmissions = device * deviceGridIntensity;
    return {
        dataCenter: dataCenterEmissions,
        network: networkEmissions,
        device: deviceEmissions
    };
};


function embodiedEnergyPerSegment(bytes) {
    const transferedBytesToGb = bytes / GIGABYTE;
    const dataCenter = transferedBytesToGb * SWDV4.EMBODIED_KWH_PER_GB_DATACENTER;
    const network = transferedBytesToGb * SWDV4.EMBODIED_KWH_PER_GB_NETWORK;
    const device = transferedBytesToGb * SWDV4.EMBODIED_KWH_PER_GB_DEVICE;
    return {
        dataCenter,
        network,
        device
    };
}


function embodiedEmissions(bytes) {
    const { dataCenter, network, device } = embodiedEnergyPerSegment(bytes);
    const dataCenterGridIntensity = averageIntensity.WORLD;
    const networkGridIntensity = averageIntensity.WORLD;
    const deviceGridIntensity = averageIntensity.WORLD;
    const dataCenterEmissions = dataCenter * dataCenterGridIntensity;
    const networkEmissions = network * networkGridIntensity;
    const deviceEmissions = device * deviceGridIntensity;
    return {
        dataCenter: dataCenterEmissions,
        network: networkEmissions,
        device: deviceEmissions
    };
}





export function co2(bytes, greenHostingFactor, intensitySelect) {
    let opEmissions = operationalEmissions(bytes, intensitySelect);
    let emEmissions = embodiedEmissions(bytes);

    const totalEmissions = {
        dataCenter: opEmissions.dataCenter * (1 - greenHostingFactor) + emEmissions.dataCenter,
        network: opEmissions.network + emEmissions.network,
        device: opEmissions.device + emEmissions.device
    };

    const total = totalEmissions.dataCenter + totalEmissions.network + totalEmissions.device;

    return total;
};